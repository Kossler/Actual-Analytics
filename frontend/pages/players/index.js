import LeaderboardPage, { getLeaderboardProps } from '../../components/LeaderboardPage';

export const runtime = 'experimental-edge';

export const getServerSideProps = getLeaderboardProps;

export default LeaderboardPage;
